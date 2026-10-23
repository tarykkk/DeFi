// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./StableCoin.sol";

contract StableEngine is ReentrancyGuard {
    StableCoin public immutable sUsd;
    AggregatorV3Interface public immutable priceFeed;

    uint256 public constant COLLATERAL_RATIO = 150;
    uint256 public constant LIQUIDATION_BONUS = 10;
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;
    uint256 public constant ADDITIONAL_FEED_PRECISION = 1e10;
    uint256 public constant PRICE_STALE_AFTER = 1 days;

    mapping(address => uint256) public collateralDeposited;
    mapping(address => uint256) public sUsdMinted;

    event CollateralDeposited(address indexed user, uint256 amount);
    event StablecoinMinted(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event StablecoinBurned(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);
    event DebugCollateralReduced(address indexed user, uint256 amount);

    constructor(address _sUsdAddress, address _priceFeed) {
        sUsd = StableCoin(_sUsdAddress);
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function depositCollateral() external payable {
        require(msg.value > 0, "Needs more than 0");
        collateralDeposited[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function mintStablecoin(uint256 _sUsdAmount) external {
        require(_sUsdAmount > 0, "Needs more than 0");

        sUsdMinted[msg.sender] += _sUsdAmount;
        _revertIfHealthFactorIsBroken(msg.sender);

        sUsd.mint(msg.sender, _sUsdAmount);
        emit StablecoinMinted(msg.sender, _sUsdAmount);
    }

    function burnStablecoin(uint256 _amount) external {
        require(_amount > 0, "Needs more than 0");
        require(sUsdMinted[msg.sender] >= _amount, "Cannot burn more than debt");

        sUsdMinted[msg.sender] -= _amount;
        sUsd.burn(msg.sender, _amount);

        emit StablecoinBurned(msg.sender, _amount);
    }

    function withdrawCollateral(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Needs more than 0");
        require(collateralDeposited[msg.sender] >= _amount, "Insufficient collateral");

        collateralDeposited[msg.sender] -= _amount;
        _revertIfHealthFactorIsBroken(msg.sender);

        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        require(success, "ETH transfer failed");

        emit CollateralWithdrawn(msg.sender, _amount);
    }

    function liquidate(address user) external nonReentrant {
        require(getHealthFactor(user) < MIN_HEALTH_FACTOR, "Position is healthy");

        uint256 debt = sUsdMinted[user];
        uint256 price = getEthUsdPrice();

        uint256 baseCollateral = (debt * 1e18) / price;
        uint256 bonus = (baseCollateral * LIQUIDATION_BONUS) / 100;
        uint256 totalToSeize = baseCollateral + bonus;

        uint256 available = collateralDeposited[user];
        if (totalToSeize > available) totalToSeize = available;

        sUsdMinted[user] = 0;
        collateralDeposited[user] = available - totalToSeize;

        sUsd.burn(msg.sender, debt); // спалюємо rUSD ліквідатора

        (bool success, ) = payable(msg.sender).call{value: totalToSeize}("");
        require(success, "ETH transfer failed");

        emit Liquidated(user, msg.sender, debt, totalToSeize);
    }

    function debugReduceCollateral(address user, uint256 amount) external {
        require(collateralDeposited[user] >= amount, "Amount too large");
        collateralDeposited[user] -= amount;
        emit DebugCollateralReduced(user, amount);
    }

    function getEthUsdPrice() public view returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        require(answer > 0, "Invalid oracle price");
        require(block.timestamp - updatedAt <= PRICE_STALE_AFTER, "Stale oracle price");
        return uint256(answer) * ADDITIONAL_FEED_PRECISION;
    }

    function getUsdValue(uint256 ethAmount) public view returns (uint256) {
        return (ethAmount * getEthUsdPrice()) / 1e18;
    }

    function getHealthFactor(address user) public view returns (uint256) {
        uint256 debt = sUsdMinted[user];
        if (debt == 0) return type(uint256).max;

        uint256 collateralValueInUsd = getUsdValue(collateralDeposited[user]);
        uint256 collateralAdjustedForThreshold = (collateralValueInUsd * 100) / COLLATERAL_RATIO;

        return (collateralAdjustedForThreshold * 1e18) / debt;
    }

    function getMaxMintableAmount(address user) public view returns (uint256) {
        uint256 collateralValueInUsd = getUsdValue(collateralDeposited[user]);
        uint256 maxUsd = (collateralValueInUsd * 100) / COLLATERAL_RATIO;
        if (maxUsd <= sUsdMinted[user]) return 0;
        return maxUsd - sUsdMinted[user];
    }

    function _revertIfHealthFactorIsBroken(address user) internal view {
        require(getHealthFactor(user) >= MIN_HEALTH_FACTOR, "Health factor is broken (under 1.0)");
    }
}
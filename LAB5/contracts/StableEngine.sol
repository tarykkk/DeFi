// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StableCoin.sol";

contract StableEngine is ReentrancyGuard {
    uint256 public constant PRECISION = 1e18;
    uint256 public constant COLLATERALIZATION_RATIO = 150;
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;

    StableCoin public immutable stablecoin;
    uint256 public mockEthUsdPrice;
    mapping(address => uint256) public collateral;
    mapping(address => uint256) public debt;

    event CollateralDeposited(address indexed user, uint256 amount);
    event StablecoinMinted(address indexed user, uint256 amount);
    event StablecoinBurned(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event MockPriceUpdated(uint256 oldPrice, uint256 newPrice);

    error ZeroAmount();
    error InsufficientDebt();
    error BrokenHealthFactor(uint256 healthFactor);
    error EthTransferFailed();

    constructor(address stablecoin_, uint256 initialEthUsdPrice) {
        require(stablecoin_ != address(0), "Invalid token");
        require(initialEthUsdPrice != 0, "Invalid price");
        stablecoin = StableCoin(stablecoin_);
        mockEthUsdPrice = initialEthUsdPrice;
    }

    function setMockEthUsdPrice(uint256 newPrice) external {
        require(newPrice != 0, "Invalid price");
        uint256 old = mockEthUsdPrice;
        mockEthUsdPrice = newPrice;
        emit MockPriceUpdated(old, newPrice);
    }

    function depositCollateral() external payable {
        if (msg.value == 0) revert ZeroAmount();
        collateral[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function maxMintable(address user) public view returns (uint256) {
        return (getCollateralValueUsd(user) * 100) / COLLATERALIZATION_RATIO;
    }

    function mintStablecoin(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        debt[msg.sender] += amount;
        _revertIfHealthFactorIsBroken(msg.sender);
        stablecoin.mint(msg.sender, amount);
        emit StablecoinMinted(msg.sender, amount);
    }

    function burnStablecoin(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (amount > debt[msg.sender]) revert InsufficientDebt();
        debt[msg.sender] -= amount;
        stablecoin.burn(msg.sender, amount);
        emit StablecoinBurned(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        require(amount <= collateral[msg.sender], "Insufficient collateral");
        collateral[msg.sender] -= amount;
        _revertIfHealthFactorIsBroken(msg.sender);
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert EthTransferFailed();
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function getCollateralValueUsd(address user) public view returns (uint256) {
        return (collateral[user] * mockEthUsdPrice) / PRECISION;
    }

    function healthFactor(address user) public view returns (uint256) {
        if (debt[user] == 0) return type(uint256).max;
        uint256 adjustedCollateral = (getCollateralValueUsd(user) * 100) / COLLATERALIZATION_RATIO;
        return (adjustedCollateral * PRECISION) / debt[user];
    }

    function _revertIfHealthFactorIsBroken(address user) internal view {
        uint256 factor = healthFactor(user);
        if (factor < MIN_HEALTH_FACTOR) revert BrokenHealthFactor(factor);
    }

    receive() external payable {
        revert("Use depositCollateral");
    }
}
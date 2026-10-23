// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract AutoCompoundVault is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable underlyingAsset;
    IERC20 public immutable rewardToken;
    IUniswapV2Router02 public immutable router;

    event Deposited(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdrawn(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Compounded(uint256 rewardSold, uint256 assetsReinvested);

    constructor(
        address _asset,
        address _rewardToken,
        address _router,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        underlyingAsset = IERC20(_asset);
        rewardToken = IERC20(_rewardToken);
        router = IUniswapV2Router02(_router);
    }

    function totalAssets() public view returns (uint256) {
        return underlyingAsset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return assets;
        }
        return (assets * supply) / totalAssets();
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return shares;
        }
        return (shares * totalAssets()) / supply;
    }

    function deposit(uint256 assets) external returns (uint256 shares) {
        require(assets > 0, "Zero assets");

        shares = convertToShares(assets);
        require(shares > 0, "Zero shares");

        _mint(msg.sender, shares);

        underlyingAsset.safeTransferFrom(msg.sender, address(this), assets);

        emit Deposited(msg.sender, msg.sender, assets, shares);
    }

    function withdraw(uint256 shares) external returns (uint256 assets) {
        require(shares > 0, "Zero shares");

        assets = convertToAssets(shares);
        require(assets > 0, "Zero assets");

        _burn(msg.sender, shares);

        underlyingAsset.safeTransfer(msg.sender, assets);

        emit Withdrawn(msg.sender, msg.sender, assets, shares);
    }

    function compound() external {
        uint256 rewardBalance = rewardToken.balanceOf(address(this));
        require(rewardBalance > 0, "No rewards to compound");

        rewardToken.forceApprove(address(router), rewardBalance);

        address[] memory path = new address[](2);
        path[0] = address(rewardToken);
        path[1] = address(underlyingAsset);

        uint256 initialAssetBalance = totalAssets();

        router.swapExactTokensForTokens(
            rewardBalance,
            1,
            path,
            address(this),
            block.timestamp + 300
        );

        uint256 newAssets = totalAssets() - initialAssetBalance;

        emit Compounded(rewardBalance, newAssets);
    }
}
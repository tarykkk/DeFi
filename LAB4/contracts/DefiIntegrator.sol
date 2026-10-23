// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract DefiIntegrator is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IUniswapV2Router02 public immutable router;

    constructor(address router_) {
        require(router_.code.length > 0, "Router has no code");
        router = IUniswapV2Router02(router_);
    }

    function provideLiquidity(
        address tokenA, address tokenB,
        uint256 amountA, uint256 amountB,
        uint256 amountAMin, uint256 amountBMin, uint256 deadline
    ) external nonReentrant returns (uint256 usedA, uint256 usedB, uint256 liquidity) {
        require(tokenA != tokenB && amountA > 0 && amountB > 0, "Invalid amounts or tokens");
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);
        IERC20(tokenA).forceApprove(address(router), amountA);
        IERC20(tokenB).forceApprove(address(router), amountB);
        (usedA, usedB, liquidity) = router.addLiquidity(
            tokenA, tokenB, amountA, amountB,
            amountAMin, amountBMin, msg.sender, deadline
        );
        IERC20(tokenA).forceApprove(address(router), 0);
        IERC20(tokenB).forceApprove(address(router), 0);
        if (amountA > usedA) IERC20(tokenA).safeTransfer(msg.sender, amountA - usedA);
        if (amountB > usedB) IERC20(tokenB).safeTransfer(msg.sender, amountB - usedB);
    }

    function swapTokens(
        address tokenIn, address tokenOut,
        uint256 amountIn, uint256 amountOutMin, uint256 deadline
    ) external nonReentrant returns (uint256[] memory amounts) {
        require(tokenIn != tokenOut && amountIn > 0 && amountOutMin > 0, "Invalid swap");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(router), amountIn);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        amounts = router.swapExactTokensForTokens(
            amountIn, amountOutMin, path, msg.sender, deadline
        );
        IERC20(tokenIn).forceApprove(address(router), 0);
    }
}
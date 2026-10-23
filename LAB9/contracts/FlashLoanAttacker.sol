// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashLoanProvider {
    function flashLoan(address receiver, address token, uint256 amount, bytes calldata data) external;
}

contract FlashLoanAttacker {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function initiateAttack(address provider, address token, uint256 amount) external {
        require(msg.sender == owner, "Only owner");
        IFlashLoanProvider(provider).flashLoan(address(this), token, amount, "");
    }

    function executeOperation(
        address token,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata
    ) external returns (bool) {

        uint256 amountToOwe = amount + premium;
        IERC20(token).approve(msg.sender, amountToOwe);

        return true;
    }

    function withdrawProfit(address token) external {
        require(msg.sender == owner, "Only owner");
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(owner, balance);
    }
}
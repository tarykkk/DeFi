// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockProtocol is Ownable {
    uint256 public fee;

    event FeeChanged(uint256 oldFee, uint256 newFee);

    constructor(address initialOwner, uint256 initialFee) Ownable(initialOwner) {
        fee = initialFee;
    }

    function setFee(uint256 newFee) external onlyOwner {
        emit FeeChanged(fee, newFee);
        fee = newFee;
    }
}
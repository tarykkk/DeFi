// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract CrossChainMessenger is Ownable {
    IRouterClient public immutable ccipRouter;
    IERC20 public immutable linkToken;

    event MessageSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address receiver,
        string text,
        uint256 feePaid
    );

    constructor(address _router, address _link) Ownable(msg.sender) {
        ccipRouter = IRouterClient(_router);
        linkToken = IERC20(_link);
    }

    function sendMessage(
        uint64 _destinationChainSelector,
        address _receiver,
        string calldata _text
    ) external onlyOwner returns (bytes32 messageId) {
        Client.EVM2AnyMessage memory evm2AnyMessage = _buildCCIPMessage(_receiver, _text);

        uint256 fees = ccipRouter.getFee(_destinationChainSelector, evm2AnyMessage);

        require(linkToken.balanceOf(address(this)) >= fees, "Not enough LINK for fees");
        require(linkToken.approve(address(ccipRouter), fees), "LINK approve failed");

        messageId = ccipRouter.ccipSend(_destinationChainSelector, evm2AnyMessage);

        emit MessageSent(messageId, _destinationChainSelector, _receiver, _text, fees);

        return messageId;
    }

    function quoteFee(
        uint64 _destinationChainSelector,
        address _receiver,
        string calldata _text
    ) external view returns (uint256) {
        return ccipRouter.getFee(_destinationChainSelector, _buildCCIPMessage(_receiver, _text));
    }

    function withdrawLink(address _to) external onlyOwner {
        linkToken.transfer(_to, linkToken.balanceOf(address(this)));
    }

    function _buildCCIPMessage(address _receiver, string calldata _text)
        internal
        view
        returns (Client.EVM2AnyMessage memory)
    {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(_receiver),
            data: abi.encode(_text),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: 300_000})),
            feeToken: address(linkToken)
        });
    }
}
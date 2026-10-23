// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleDAO {
    IERC20 public immutable governanceToken;
    uint256 public proposalCount;

    uint256 public constant VOTING_PERIOD = 5 minutes;

    struct Proposal {
        address targetContract;
        bytes payload;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 deadline;
        bool executed;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 id, address target, string description);
    event Voted(uint256 id, address voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 id);

    constructor(address _govToken) {
        governanceToken = IERC20(_govToken);
    }

    function createProposal(
        address _targetContract,
        bytes calldata _payload,
        string calldata _description
    ) external {
        require(governanceToken.balanceOf(msg.sender) > 0, "Must hold tokens to propose");

        uint256 id = proposalCount++;
        Proposal storage p = proposals[id];
        p.targetContract = _targetContract;
        p.payload = _payload;
        p.deadline = block.timestamp + VOTING_PERIOD;

        emit ProposalCreated(id, _targetContract, _description);
    }

    function vote(uint256 _proposalId, bool _support) external {
        Proposal storage p = proposals[_proposalId];
        require(block.timestamp < p.deadline, "Voting ended");
        require(!hasVoted[_proposalId][msg.sender], "Already voted");

        uint256 voterWeight = governanceToken.balanceOf(msg.sender);
        require(voterWeight > 0, "No voting power");

        if (_support) {
            p.yesVotes += voterWeight;
        } else {
            p.noVotes += voterWeight;
        }

        hasVoted[_proposalId][msg.sender] = true;
        emit Voted(_proposalId, msg.sender, _support, voterWeight);
    }

    function executeProposal(uint256 _proposalId) external {
        Proposal storage p = proposals[_proposalId];
        require(block.timestamp >= p.deadline, "Voting is still ongoing");
        require(!p.executed, "Already executed");
        require(p.yesVotes > p.noVotes, "Proposal rejected");

        p.executed = true;

        (bool success, ) = p.targetContract.call(p.payload);
        require(success, "Transaction execution failed");

        emit ProposalExecuted(_proposalId);
    }
}
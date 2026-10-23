const { ethers } = require("hardhat");
const d = require("../deployment.json");
const proposal = require("../proposal.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [executor] = await ethers.getSigners();
  const dao = await ethers.getContractAt("SimpleDAO", d.dao, executor);
  const mock = await ethers.getContractAt("MockProtocol", d.mock, executor);
  const id = BigInt(proposal.id);

  const p = await dao.proposals(id);
  console.log("Proposal #" + id, "| FOR:", p.yesVotes.toString(), "| AGAINST:", p.noVotes.toString());
  console.log("fee before execution:", (await mock.fee()).toString());
  console.log("owner MockProtocol:", await mock.owner(), "(DAO:", d.dao + ")");

  while (true) {
    const block = await ethers.provider.getBlock("latest");
    const left = Number(p.deadline) - block.timestamp;
    if (left <= 0) break;
    console.log(`Voting is underway; remaining ~${left} с...`);
    await sleep(12000);
  }

  console.log("\nVoting has concluded. We are implementing the proposal...");
  const tx = await dao.executeProposal(id);
  console.log("Tx executeProposal:", tx.hash);
  const receipt = await tx.wait();

  console.log("\n[SUCCESS] The proposal was executed in the block:", receipt.blockNumber);
  console.log("fee after execution:", (await mock.fee()).toString());
  console.log("Sepolia Etherscan (tx):  https://sepolia.etherscan.io/tx/" + receipt.hash);
  console.log("Sepolia Etherscan (fee): https://sepolia.etherscan.io/address/" + d.mock + "#readContract");
}

main().catch((e) => { console.error(e); process.exit(1); });
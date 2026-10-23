const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const d = require("../deployment.json");

async function main() {
  const [proposer] = await ethers.getSigners();
  const dao = await ethers.getContractAt("SimpleDAO", d.dao, proposer);
  const mock = await ethers.getContractAt("MockProtocol", d.mock, proposer);

  const newFee = BigInt(process.env.NEW_FEE || "10");

  const payload = mock.interface.encodeFunctionData("setFee", [newFee]);
  console.log("[DAO Agent] Payload setFee(" + newFee + "):", payload);

  const description = `Proposal #1: change the protocol commission to ${newFee}`;
  console.log("[DAO Agent] Creating a new offer...");
  const tx = await dao.createProposal(d.mock, payload, description);
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();

  let id;
  for (const log of receipt.logs) {
    try {
      const p = dao.interface.parseLog(log);
      if (p && p.name === "ProposalCreated") id = p.args.id;
    } catch (_) {}
  }

  const prop = await dao.proposals(id);
  console.log("\n[SUCCESS] Proposal created in block:", receipt.blockNumber);
  console.log("Offer ID:", id.toString());
  console.log("Targeted Contract:", prop.targetContract);
  console.log("Voting deadline:", new Date(Number(prop.deadline) * 1000).toLocaleTimeString("uk-UA"));
  console.log("Vote within 5 minutes!");

  fs.writeFileSync(
    path.join(__dirname, "..", "proposal.json"),
    JSON.stringify({ id: id.toString(), txHash: receipt.hash }, null, 2)
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
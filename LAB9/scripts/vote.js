const { ethers } = require("hardhat");
const d = require("../deployment.json");
const proposal = require("../proposal.json");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const [voter] = await ethers.getSigners();
  const dao = await ethers.getContractAt("SimpleDAO", d.dao, voter);
  const token = new ethers.Contract(d.govToken, ERC20_ABI, voter);
  const dec = await token.decimals();
  const id = BigInt(proposal.id);

  console.log("Voter:", voter.address);
  console.log("Voting weight (token balance):", ethers.formatUnits(await token.balanceOf(voter.address), dec));

  const tx = await dao.vote(id, true);
  console.log("Tx voting:", tx.hash);
  await tx.wait();

  const p = await dao.proposals(id);
  console.log("\nVotes FOR:    ", ethers.formatUnits(p.yesVotes, dec));
  console.log("Votes AGAINST: ", ethers.formatUnits(p.noVotes, dec));
  console.log("Deadline:", new Date(Number(p.deadline) * 1000).toLocaleTimeString("uk-UA"));
  console.log("After the deadline, run: execute.js");
}

main().catch((e) => { console.error(e); process.exit(1); });
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ARB_SEPOLIA } = require("./config");

const FILE = path.join(__dirname, "..", "deployment.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log("Deploy from the account:", deployer.address);
  console.log("Chain: chainId", net.chainId.toString());
  console.log("ETH Balance (Arbitrum Sepolia):", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const receiver = await ethers.deployContract("MessageReceiver", [ARB_SEPOLIA.router]);
  await receiver.waitForDeployment();
  const addr = await receiver.getAddress();

  console.log("MessageReceiver:", addr);
  console.log("Recipient's router:", await receiver.getRouter());

  const cur = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
  cur.receiver = addr;
  fs.writeFileSync(FILE, JSON.stringify(cur, null, 2));
  console.log("Saved to deployment.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { SEPOLIA } = require("./config");

const FILE = path.join(__dirname, "..", "deployment.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploy from the account:", deployer.address);
  console.log("Chain:", (await ethers.provider.getNetwork()).name);

  const messenger = await ethers.deployContract("CrossChainMessenger", [SEPOLIA.router, SEPOLIA.link]);
  await messenger.waitForDeployment();
  const addr = await messenger.getAddress();

  console.log("CrossChainMessenger:", addr);
  console.log("CCIP Router:", await messenger.ccipRouter());
  console.log("LINK:", await messenger.linkToken());

  const cur = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : {};
  cur.messenger = addr;
  cur.owner = deployer.address;
  fs.writeFileSync(FILE, JSON.stringify(cur, null, 2));
  console.log("Saved to deployment.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
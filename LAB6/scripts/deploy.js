const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploy from the account:", deployer.address);

  const coin = await ethers.deployContract("StableCoin", [deployer.address]);
  await coin.waitForDeployment();
  const coinAddr = await coin.getAddress();
  console.log("StableCoin:", coinAddr);

  const engine = await ethers.deployContract("StableEngine", [coinAddr, ETH_USD_FEED]);
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log("StableEngine:", engineAddr);

  const tx = await coin.transferOwnership(engineAddr);
  await tx.wait();
  console.log("StableCoin holder->", await coin.owner());

  fs.writeFileSync(
    path.join(__dirname, "..", "deployment.json"),
    JSON.stringify(
      { network: "sepolia", stableCoin: coinAddr, engine: engineAddr, priceFeed: ETH_USD_FEED, borrower: deployer.address },
      null,
      2
    )
  );
  console.log("Addresses saved in deployment.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
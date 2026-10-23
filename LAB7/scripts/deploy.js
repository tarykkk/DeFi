const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const { TOKEN_A, TOKEN_B, ROUTER } = process.env;
  if (!TOKEN_A || !TOKEN_B || !ROUTER) throw new Error("Fill in TOKEN_A, TOKEN_B, ROUTER у .env");

  const [deployer] = await ethers.getSigners();
  console.log("Deploy from the account:", deployer.address);

  const vault = await ethers.deployContract("AutoCompoundVault", [
    TOKEN_A,
    TOKEN_B,
    ROUTER,
    "Vault Token A",
    "vTKA",
  ]);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  console.log("AutoCompoundVault:", vaultAddr);
  console.log("Underlying asset (Token A):", await vault.underlyingAsset());
  console.log("Reward (Token B):", await vault.rewardToken());
  console.log("Router:", await vault.router());

  fs.writeFileSync(
    path.join(__dirname, "..", "deployment.json"),
    JSON.stringify({ network: "sepolia", vault: vaultAddr, tokenA: TOKEN_A, tokenB: TOKEN_B, router: ROUTER }, null, 2)
  );
  console.log("Addresses saved in deployment.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
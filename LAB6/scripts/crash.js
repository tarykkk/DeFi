const { ethers } = require("hardhat");
const d = require("../deployment.json");

async function main() {
  const [signer] = await ethers.getSigners();
  const engine = await ethers.getContractAt("StableEngine", d.engine, signer);

  const collateral = await engine.collateralDeposited(d.borrower);
  const cut = (collateral * 20n) / 100n;

  console.log("HF before:", ethers.formatEther(await engine.getHealthFactor(d.borrower)));
  const tx = await engine.debugReduceCollateral(d.borrower, cut);
  console.log("Backdoor Tx:", tx.hash);
  await tx.wait();
  console.log("HF after:", ethers.formatEther(await engine.getHealthFactor(d.borrower)));
}

main().catch((e) => { console.error(e); process.exit(1); });
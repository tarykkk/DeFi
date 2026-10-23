const { ethers } = require("hardhat");
const d = require("../deployment.json");

async function main() {
  const [borrower, liquidator] = await ethers.getSigners();
  if (!liquidator) throw new Error("Add LIQUIDATOR_PRIVATE_KEY in .env");

  const engine = await ethers.getContractAt("StableEngine", d.engine, borrower);
  const coin = await ethers.getContractAt("StableCoin", d.stableCoin, borrower);

  const depositEth = process.env.DEPOSIT_ETH || "0.01";
  console.log(`Депозит ${depositEth} ETH...`);
  await (await engine.depositCollateral({ value: ethers.parseEther(depositEth) })).wait();

  const price = await engine.getEthUsdPrice();
  console.log("Ціна ETH/USD з Chainlink:", ethers.formatEther(price));

  const max = await engine.getMaxMintableAmount(borrower.address);
  const amount = (max * 10n) / 11n;
  console.log("Емісія rUSD:", ethers.formatEther(amount));
  await (await engine.mintStablecoin(amount)).wait();

  console.log("Transfer rUSD to the liquidator's wallet:", liquidator.address);
  await (await coin.transfer(liquidator.address, amount)).wait();

  const hf = await engine.getHealthFactor(borrower.address);
  console.log("\nBorrower:", borrower.address);
  console.log("Pledge (ETH):", ethers.formatEther(await engine.collateralDeposited(borrower.address)));
  console.log("Debt (rUSD):", ethers.formatEther(await engine.sUsdMinted(borrower.address)));
  console.log("Health Factor:", ethers.formatEther(hf));
}

main().catch((e) => { console.error(e); process.exit(1); });
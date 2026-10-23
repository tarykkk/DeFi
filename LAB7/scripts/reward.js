const { ethers } = require("hardhat");
const d = require("../deployment.json");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const tokenB = new ethers.Contract(d.tokenB, ERC20_ABI, signer);
  const dec = await tokenB.decimals();
  const amount = ethers.parseUnits(process.env.REWARD_AMOUNT || "100", dec);

  console.log("Token B in storage before:", ethers.formatUnits(await tokenB.balanceOf(d.vault), dec));
  const tx = await tokenB.transfer(d.vault, amount);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("Token B in storage after:", ethers.formatUnits(await tokenB.balanceOf(d.vault), dec));
}

main().catch((e) => { console.error(e); process.exit(1); });
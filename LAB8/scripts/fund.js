const { ethers } = require("hardhat");
const d = require("../deployment.json");
const { SEPOLIA } = require("./config");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const link = new ethers.Contract(SEPOLIA.link, ERC20_ABI, signer);
  const amount = ethers.parseEther(process.env.LINK_FUND || "2");

  const mine = await link.balanceOf(signer.address);
  console.log("LINK на гаманці:", ethers.formatEther(mine));
  if (mine < amount) throw new Error("Not enough LINK");

  console.log("LINK in Messenger before:", ethers.formatEther(await link.balanceOf(d.messenger)));
  const tx = await link.transfer(d.messenger, amount);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("LINK in Messenger after:", ethers.formatEther(await link.balanceOf(d.messenger)));
}

main().catch((e) => { console.error(e); process.exit(1); });
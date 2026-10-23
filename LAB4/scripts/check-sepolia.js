import assert from 'node:assert/strict';
import { Contract, JsonRpcProvider } from 'ethers';

if (!process.env.SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL.includes('YOUR_ALCHEMY_API_KEY')) {
  console.error('Set SEPOLIA_RPC_URL in .env to the Ethereum Sepolia HTTPS endpoint from Alchemy.');
  process.exit(1);
}
const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL, undefined, { cacheTimeout: -1 });
try {
  const network = await provider.getNetwork();
  assert.equal(network.chainId, 11155111n, 'Choose Ethereum Sepolia in Alchemy');
  const address = '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3';
  assert.notEqual(await provider.getCode(address), '0x', 'Router has no bytecode');
  const router = new Contract(address, ['function factory() view returns(address)'], provider);
  const factory = await router.factory();
  assert.equal(factory.toLowerCase(), '0xf62c03e08ada871a0beb309762e260a7a6a880e6');
  console.log('Network: Ethereum Sepolia');
  console.log('chainId: 11155111');
  console.log(`Latest block: ${await provider.getBlockNumber()}`);
  console.log(`Uniswap V2 Router: ${address}`);
  console.log(`Uniswap V2 Factory: ${factory}`);
  console.log('Connection and Router checks: PASS');
} catch (error) {
  // Avoid showing RPC credentials in errors or screenshots.
  console.error('Sepolia check failed. Check the Alchemy endpoint, network and access settings.');
  console.error(error.code || (error instanceof assert.AssertionError ? error.message : 'RPC_ERROR'));
  process.exitCode = 1;
} finally {
  provider.destroy();
}
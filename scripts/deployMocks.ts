import { deployContract, etherscanVerification } from "../helpers/contract";
import { getCommonEnvs } from "../helpers/envValidation";

async function deployMocks() {
  const { verify } = getCommonEnvs();

  const underlyingAssetArgs = ["DAI", "DAI"];
  const underlyingAsset = await deployContract("ERC20Mock", underlyingAssetArgs);

  const underlyingVaultArgs = [underlyingAsset.address, "DAI Invest Vault", "ivDAI"];
  const underlyingVault = await deployContract("ERC4626Mock", underlyingVaultArgs);

  const poolArgs = [underlyingAsset.address];
  const pool = await deployContract("PoolMock", poolArgs);

  const coverNFTArgs = ["coverNFT", "CNFT"];
  const coverNFT = await deployContract("CoverNFTMock", coverNFTArgs);

  const coverArgs = [pool.address, coverNFT.address];
  const cover = await deployContract("CoverMock", coverArgs);

  const yieldTokenIncidents = await deployContract("YieldTokenIncidentsMock", []);

  if (verify == "true") {
    await etherscanVerification(underlyingAsset.address, underlyingAssetArgs);
    await etherscanVerification(underlyingVault.address, underlyingVaultArgs);
    await etherscanVerification(pool.address, poolArgs);
    await etherscanVerification(coverNFT.address, coverNFTArgs);
    await etherscanVerification(cover.address, coverArgs);
    await etherscanVerification(yieldTokenIncidents.address, []);
  }

  console.log("\nUnderlying Asset Mock: ", underlyingAsset.address);
  console.log("Underlying Vault Mock: ", underlyingVault.address);
  console.log("Nexus Pool Mock: ", pool.address);
  console.log("Nexus Cover NFT Mock: ", coverNFT.address);
  console.log("Nexus Cover Mock: ", cover.address);
  console.log("Nexus YieldTokenIncidents Mock: ", yieldTokenIncidents.address);

  console.log("\nDeployment complete!");
}

deployMocks()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });

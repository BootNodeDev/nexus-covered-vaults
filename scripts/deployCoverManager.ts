import { deployContract, etherscanVerification } from "../helpers/contract";
import { getCoverManagerEnvs } from "../helpers/envValidation";
import { CoverManager } from "../typechain-types";

async function deployCoverManager() {
  const { pool, cover, yieldTokenIncidents, owner, verify } = getCoverManagerEnvs();

  const coverManagerArgs = [cover, yieldTokenIncidents, pool];
  const coverManager = (await deployContract("CoverManager", coverManagerArgs)) as CoverManager;

  console.log(`\nTransferring Cover Manager ownership to ${owner}...`);
  const ownershipTx = await coverManager.transferOwnership(owner);
  console.log("Tx:", ownershipTx.hash);
  await ownershipTx.wait();

  if (verify == "true") {
    await etherscanVerification(coverManager.address, coverManagerArgs);
  }

  console.log("\nCover Manager: ", coverManager.address);

  console.log("\nDeployment complete!");
}

deployCoverManager()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });

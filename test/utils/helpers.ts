import { BigNumberish } from "ethers";
import { ERC20Mock, ERC4626Mock } from "../../typechain-types";

export async function increaseUVValue(underlyingVault: ERC4626Mock, underlyingAsset: ERC20Mock, amount: BigNumberish) {
  await underlyingAsset.mint(underlyingVault.address, amount);
}

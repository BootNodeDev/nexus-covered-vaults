// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { CoveredVault } from "./CoveredVault.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title CoveredVaultFactory
 * @dev Factory to deploy new CoveredVault instances
 */
contract CoveredVaultFactory {
  event CoveredVaultCreated(address indexed vault);

  /**
   * @dev Deploys a new CoveredVault
   * @param _underlyingVault Underlying vault ERC4626-compatible contract
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   */
  function create(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol
  ) external returns (address) {
    CoveredVault vault = new CoveredVault(_underlyingVault, _name, _symbol);

    emit CoveredVaultCreated(address(vault));

    return address(vault);
  }
}

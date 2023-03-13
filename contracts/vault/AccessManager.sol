// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { AccessControlEnumerable } from "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title AccessManager
 * @dev Implements roles based access for restricted operations
 */
contract AccessManager is AccessControlEnumerable, Pausable {
  /**
   * @dev Role for botOperator
   */
  bytes32 public constant BOT_ROLE = keccak256("BOT_ROLE");

  /**
   * @dev Validates that the sender is the main admin of the contract or has the required role
   * @param role the role to validate
   */
  modifier onlyAdminOrRole(bytes32 role) {
    _onlyAdminOrRole(role, _msgSender());
    _;
  }

  /**
   * @dev Initializes the main admin role
   * @param admin the address of the main admin role
   */
  constructor(address admin) {
    _setupRole(DEFAULT_ADMIN_ROLE, admin);
  }

  /**
   * @dev Triggers stopped state.
   * In this state the following methods are not callable:
   * - All user flows deposit/mint/redeem/withdraw
   * - Operator methods that interact with the underlying vault
   *
   * Requirements:
   *
   * - The contract must not be paused.
   */
  function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
    _pause();
  }

  /**
   * @dev Returns to normal state.
   *
   * Requirements:
   *
   * - The contract must be paused.
   */
  function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
    _unpause();
  }

  /**
   * @dev Validates that the account is the main admin of the contract or has the required role
   * @param role the role to validate
   * @param account the address to validate
   */
  function _onlyAdminOrRole(bytes32 role, address account) internal view {
    if (!hasRole(DEFAULT_ADMIN_ROLE, account)) {
      _checkRole(role, account);
    }
  }
}

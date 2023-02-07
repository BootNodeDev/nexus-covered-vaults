// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CoverManager
 * @dev Interacts with Nexus Mutual on behalf of allowed accounts.
 * A Nexus Mutual member MUST transfer the membership to this contract to be able to access the protocol.
 */
contract CoverManager is Ownable {
  address public immutable cover;
  address public immutable yieldTokenIncident;
  mapping(address => bool) public allowList;

  /* ========== Events ========== */

  event Allowed(address indexed account);
  event Disallowed(address indexed account);

  /* ========== Custom Errors ========== */

  error CoverManager_NotAllowed();
  error CoverManager_AlreadyAllowed();
  error CoverManager_AlreadyDisallowed();

  modifier onlyAllowed() {
    if (!allowList[msg.sender]) {
      revert CoverManager_NotAllowed();
    }
    _;
  }

  /* ========== Constructor ========== */

  /**
   * @dev Initializes the main admin role
   * @param _cover Address of the Cover contract
   * @param _yieldTokenIncident Address of the YieldTokenIncident contract
   */
  constructor(address _cover, address _yieldTokenIncident) {
    cover = _cover;
    yieldTokenIncident = _yieldTokenIncident;
  }

  /* ========== Admin methods ========== */

  /**
   * @dev Allows an account to call methods in this contract
   * @param _account Address to allow calling methods
   */
  function addToAllowList(address _account) external onlyOwner {
    if (allowList[_account]) {
      revert CoverManager_AlreadyAllowed();
    }

    allowList[_account] = true;
    emit Allowed(_account);
  }

  /**
   * @dev Remove permission of an account to call methods in this contract
   * @param _account Address to reject calling methods
   */
  function removeFromAllowList(address _account) external onlyOwner {
    if (!allowList[_account]) {
      revert CoverManager_AlreadyDisallowed();
    }

    allowList[_account] = false;
    emit Disallowed(_account);
  }
}

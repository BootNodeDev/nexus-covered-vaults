// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CoverManager
 * @dev Contract allowed to interact with Nexus Mutual on behalf of allowed CoveredVaults
 */
contract CoverManager is Ownable {
  address public coverContract;
  address public yieldTokenIncidentContract;
  mapping(address => bool) public isAllowed;

  event Allowed(address indexed addressAllowed);
  event Disallowed(address indexed addressDisallowed);

  error AddressNotAllowed();
  error AlreadyAllowed();
  error AlreadyDisallowed();

  modifier onlyAllowed() {
    if (!isAllowed[msg.sender]) {
      revert AddressNotAllowed();
    }
    _;
  }

  /**
   * @dev Initializes the main admin role
   */
  constructor(address _coverAddress, address _yieldTokenIncidentAddress) {
    coverContract = _coverAddress;
    yieldTokenIncidentContract = _yieldTokenIncidentAddress;
  }

  /**
   * @dev Allow a CoveredVault to call methods in this contract
   * @param _toAllow Address to allow calling methods
   */
  function allowCaller(address _toAllow) external onlyOwner {
    if (isAllowed[_toAllow]) {
      revert AlreadyAllowed();
    }
    isAllowed[_toAllow] = true;
    emit Allowed(_toAllow);
  }

  /**
   * @dev Remove permission of a CoveredVault to call methods in this contract
   * @param _toDisallow Address to reject calling methods
   */
  function disallowCaller(address _toDisallow) external onlyOwner {
    if (!isAllowed[_toDisallow]) {
      revert AlreadyDisallowed();
    }
    isAllowed[_toDisallow] = false;
    emit Disallowed(_toDisallow);
  }
}

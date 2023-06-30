// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

contract ERC4626Mock is ERC4626, ERC20Permit {
  constructor(
    IERC20 _asset,
    string memory _name,
    string memory _symbol
  ) ERC4626(_asset) ERC20(_name, _symbol) ERC20Permit(_name) {
    // solhint-disable-previous-line no-empty-blocks
  }

  function decimals() public view virtual override(ERC4626, ERC20) returns (uint8) {
    return super.decimals();
  }
}

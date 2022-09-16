// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ERC4626Mock is ERC4626 {
  constructor(
    IERC20 _asset,
    string memory _name,
    string memory _symbol
  ) ERC4626(_asset) ERC20(_name, _symbol) {
    // solhint-disable-previous-line no-empty-blocks
  }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./VotedValue.sol";
import "./IP3D.sol";
import "./IPrecompileERC20.sol";

contract Governance is ReentrancyGuard {

	using SafeERC20 for IERC20;

	uint constant public governance_challenging_period = 10 days;
	uint constant public governance_freeze_period = 30 days;

	// P3D precompile address constant
	address public constant P3D_PRECOMPILE = 0x0000000000000000000000000000000000000802;

	address public votingTokenAddress;
	address public governedContractAddress;

	mapping(address => uint) public balances;

	VotedValue[] public votedValues;
	mapping(string => VotedValue) public votedValuesMap;

	event Deposit(address indexed who, uint amount);
	event Withdrawal(address indexed who, uint amount);


	constructor(address _governedContractAddress, address _votingTokenAddress){
		init(_governedContractAddress, _votingTokenAddress);
	}

	function init(address _governedContractAddress, address _votingTokenAddress) public {
		require(governedContractAddress == address(0), "governance already initialized");
		governedContractAddress = _governedContractAddress;
		votingTokenAddress = _votingTokenAddress;
	}

	function addressBelongsToGovernance(address addr) public view returns (bool) {
		for (uint i = 0; i < votedValues.length; i++)
			if (address(votedValues[i]) == addr)
				return true;
		return false;
	}

	function isUntiedFromAllVotes(address addr) public view returns (bool) {
		for (uint i = 0; i < votedValues.length; i++)
			if (votedValues[i].hasVote(addr))
				return false;
		return true;
	}

	function addVotedValue(string memory name, VotedValue votedValue) external {
		require(msg.sender == governedContractAddress, "not authorized");
		votedValues.push(votedValue);
		votedValuesMap[name] = votedValue;
	}

	// Helper function to detect 3DPass ERC20 precompiles
	function is3DPassERC20Precompile(address tokenAddr) internal pure returns (bool) {
		// 3DPass ERC20 precompiles have prefix 0xFBFBFBFA..
		// Check if the address starts with 0xFBFBFBFA
		return uint160(tokenAddr) >> 128 == 0xFBFBFBFA;
	}

	// Helper functions for P3D handling
	function isP3D(address token) internal pure returns (bool) {
		return token == P3D_PRECOMPILE;
	}


	// deposit

	function deposit(uint amount) payable external {
		deposit(msg.sender, amount);
	}

	function deposit(address from, uint amount) nonReentrant payable public {
		require(from == msg.sender || addressBelongsToGovernance(msg.sender), "not allowed");
		if (isP3D(votingTokenAddress)) {
			require(msg.value == 0, "don't send P3D");
			require(IP3D(votingTokenAddress).transferFrom(from, address(this), amount), "P3D transferFrom failed");
		} else if (is3DPassERC20Precompile(votingTokenAddress)) {
			require(msg.value == 0, "don't send P3D");
			require(IPrecompileERC20(votingTokenAddress).transferFrom(from, address(this), amount), "3DPass ERC20 transferFrom failed");
		} else {
			// Handle regular ERC20 contracts (like assistants) using SafeERC20
			require(msg.value == 0, "don't send P3D");
			IERC20(votingTokenAddress).safeTransferFrom(from, address(this), amount);
		}
		balances[from] += amount;
		emit Deposit(from, amount);
	}


	// withdrawal functions

	function withdraw() external {
		withdraw(balances[msg.sender]);
	}

	function withdraw(uint amount) nonReentrant public {
		require(amount > 0, "zero withdrawal requested");
		require(amount <= balances[msg.sender], "not enough balance");
		require(isUntiedFromAllVotes(msg.sender), "some votes not removed yet");
		balances[msg.sender] -= amount;
		if (isP3D(votingTokenAddress))
			require(IP3D(votingTokenAddress).transfer(msg.sender, amount), "P3D transfer failed");
		else if (is3DPassERC20Precompile(votingTokenAddress))
			require(IPrecompileERC20(votingTokenAddress).transfer(msg.sender, amount), "3DPass ERC20 transfer failed");
		else
			// Handle regular ERC20 contracts (like assistants) using SafeERC20
			IERC20(votingTokenAddress).safeTransfer(msg.sender, amount);
		emit Withdrawal(msg.sender, amount);
	}
}

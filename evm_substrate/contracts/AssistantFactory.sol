// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ExportAssistant.sol";
import "./ImportWrapperAssistant.sol";
import "./ImportWrapper.sol";
import "./CounterstakeLibrary.sol";
import "./VotedValueFactory.sol";


contract AssistantFactory {

	event NewExportAssistant(address contractAddress, address bridgeAddress, address manager, string symbol);
	event NewImportWrapperAssistant(address contractAddress, address bridgeAddress, address precompileAddress, string name, string symbol);

	address public immutable exportAssistantMaster;
	address public immutable importWrapperAssistantMaster;

	GovernanceFactory private immutable governanceFactory;
	VotedValueFactory private immutable votedValueFactory;

	constructor(address _exportAssistantMaster, address _importWrapperAssistantMaster, GovernanceFactory _governanceFactory, VotedValueFactory _votedValueFactory) {
		exportAssistantMaster = _exportAssistantMaster;
		importWrapperAssistantMaster = _importWrapperAssistantMaster;
		governanceFactory = _governanceFactory;
		votedValueFactory = _votedValueFactory;
	}

	function createExportAssistant(
		address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, address oracleAddr, uint8 _exponent, string memory name, string memory symbol
	) external returns (ExportAssistant exportAssistant) {
		exportAssistant = ExportAssistant(payable(Clones.clone(exportAssistantMaster)));
		exportAssistant.initExportAssistant(bridgeAddr, managerAddr, _management_fee10000, _success_fee10000, oracleAddr, _exponent, name, symbol);
		exportAssistant.setupGovernance(governanceFactory, votedValueFactory);
		emit NewExportAssistant(address(exportAssistant), bridgeAddr, managerAddr, symbol);
	}

	function createImportWrapperAssistant(
		address bridgeAddress,
		address managerAddress,
		uint16 management_fee10000,
		uint16 success_fee10000,
		uint16 swap_fee10000,
		uint8 exponent,
		string memory name,
		string memory symbol
	) external returns (ImportWrapperAssistant) {
		ImportWrapperAssistant assistant = ImportWrapperAssistant(payable(Clones.clone(importWrapperAssistantMaster)));
		assistant.initImportWrapperAssistant(bridgeAddress, managerAddress, management_fee10000, success_fee10000, swap_fee10000, exponent, name, symbol);
		assistant.setupGovernance(governanceFactory, votedValueFactory);
		
		// Get the precompile address from the bridge
		address precompileAddress = ImportWrapper(bridgeAddress).precompileAddress();
		emit NewImportWrapperAssistant(address(assistant), bridgeAddress, precompileAddress, name, symbol);
		return assistant;
	}

}


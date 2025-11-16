"use strict";

/**
 * Address Normalizer
 * 
 * Centralized logic for distinguishing between EVM addresses (0x...) and Obyte addresses (base58),
 * and normalizing/checksumming EVM addresses for consistent storage and comparison.
 */

const { ethers } = require("ethers");

/**
 * Check if an address is in EVM format (starts with 0x and is 42 characters long)
 * @param {string} address - The address to check
 * @returns {boolean} True if the address appears to be an EVM address
 */
function isEVMAddress(address) {
	if (!address || typeof address !== 'string') {
		return false;
	}
	return address.startsWith('0x') && address.length === 42;
}

/**
 * Normalize an address to checksummed format if it's an EVM address
 * For Obyte addresses (base58), returns the address as-is
 * 
 * @param {string} address - The address to normalize
 * @param {Object} networkApi - Optional network API instance to validate the address
 * @returns {string} Checksummed EVM address or original address if not EVM
 */
function normalizeAddress(address, networkApi = null) {
	if (!address) {
		return address;
	}
	
	// Only normalize EVM addresses (0x...)
	if (!isEVMAddress(address)) {
		// For non-EVM addresses (Obyte base58), keep as-is
		return address;
	}
	
	// If networkApi is provided, validate the address first
	if (networkApi && networkApi.isValidAddress) {
		if (!networkApi.isValidAddress(address)) {
			// Invalid address, return as-is
			return address;
		}
	}
	
	// Checksum the EVM address
	try {
		return ethers.utils.getAddress(address);
	} catch (e) {
		// If checksumming fails, return as-is
		return address;
	}
}

/**
 * Normalize an address to checksummed format (case-insensitive comparison)
 * This is useful for comparing addresses that might be in different cases
 * 
 * @param {string} address - The address to normalize
 * @returns {string} Checksummed EVM address or original address if not EVM
 */
function normalizeAddressCaseInsensitive(address) {
	if (!address) {
		return address;
	}
	
	// Only normalize EVM addresses (0x...)
	if (!isEVMAddress(address)) {
		// For non-EVM addresses (Obyte base58), keep as-is
		return address;
	}
	
	// Checksum the EVM address (convert to lowercase first for case-insensitive comparison)
	try {
		return ethers.utils.getAddress(address.toLowerCase());
	} catch (e) {
		// If checksumming fails, return lowercase version
		return address.toLowerCase();
	}
}

module.exports = {
	isEVMAddress,
	normalizeAddress,
	normalizeAddressCaseInsensitive
};


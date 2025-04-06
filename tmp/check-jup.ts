import { JupiterAPI } from 'jup-api';

// Log the methods available on JupiterAPI
console.log('JupiterAPI methods:');
console.log(Object.getOwnPropertyNames(JupiterAPI.prototype));

// Also log any exported functions from the module
console.log('\nExported from jup-api:');
import * as jupApi from 'jup-api';
console.log(Object.keys(jupApi));

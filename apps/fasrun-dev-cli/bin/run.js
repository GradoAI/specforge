#!/usr/bin/env node
// Entry of the fasrun and fas commands.
import { main } from '../dist/index.mjs';

process.exitCode = await main(process.argv.slice(2));

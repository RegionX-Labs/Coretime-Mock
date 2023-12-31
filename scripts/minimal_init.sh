#!/bin/bash

if [ -d "bin" ]; then
    rm -r bin/
fi
mkdir bin/

cd polkadot-sdk/

# Build the polkadot relay chain binary. Needed to run rococo.
cargo build --locked --profile testnet --features fast-runtime --bin polkadot --bin polkadot-prepare-worker --bin polkadot-execute-worker

# Build the polkadot-parachain binary. Needed to run the Coretime chain.
cargo build --profile testnet -p polkadot-parachain-bin

cp ./target/testnet/polkadot-parachain ../bin/
cp ./target/testnet/polkadot ../bin/
cp ./target/testnet/polkadot-execute-worker ../bin/
cp ./target/testnet/polkadot-prepare-worker ../bin/

cd ..

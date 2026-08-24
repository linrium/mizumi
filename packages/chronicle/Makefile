SHELL := /bin/sh

DATA_DIR ?= .data
DEMO_DIR ?= $(DATA_DIR)/demo
LOG_DIR ?= $(DATA_DIR)/tessera
CHRONICLE_ADDR ?= :3008
WITNESS_A_ADDR ?= :3011
WITNESS_B_ADDR ?= :3012

CHRONICLE_SIGNER_KEY := $(DEMO_DIR)/chronicle-signer.key
CHRONICLE_SIGNER_PUB := $(DEMO_DIR)/chronicle-signer.key.pub
WITNESS_A_KEY := $(DEMO_DIR)/witness-a.key
WITNESS_A_STATE := $(DEMO_DIR)/witness-a-state
WITNESS_B_KEY := $(DEMO_DIR)/witness-b.key
WITNESS_B_STATE := $(DEMO_DIR)/witness-b-state
WITNESS_POLICY := $(DEMO_DIR)/witness-policy

CHRONICLE_SIGNER_KEY_VALUE := PRIVATE+KEY+chronicle+b59447d9+AWa3mRH8LpAqPYER7xo1r17eF+OOwn78YCeE/C43UErX
CHRONICLE_SIGNER_PUB_VALUE := chronicle+b59447d9+AQrolSg0fHgLthI/SMPGLWKSxjh68AD1nFC1lfuFRJci
WITNESS_A_KEY_VALUE := PRIVATE+KEY+chronicle-witness-a+d27eb421+AVrBsbTjWEUJCyWRoiJEfd2gxHAbJbx0sfhU+G6oImAa
WITNESS_A_PUB_VALUE := chronicle-witness-a+d20bc03f+BEq/8C02KWBHKydd2B/VxZngcySa7tf2iMvnFAZBZYM1
WITNESS_B_KEY_VALUE := PRIVATE+KEY+chronicle-witness-b+c7b4bf09+AUMelL/NrdYCEM+x/Mm44jUc/YYGTw5PknIKX/ITb8ub
WITNESS_B_PUB_VALUE := chronicle-witness-b+c43965fa+BDo+DdwgdqA72U9FKS6M1zXceB7WWQgd4T4EiwNayB8N

.PHONY: witness-demo-files run run-server run-witness-a run-witness-b _run-server _run-witness-a _run-witness-b clean-demo

witness-demo-files:
	mkdir -p "$(DEMO_DIR)" "$(WITNESS_A_STATE)" "$(WITNESS_B_STATE)"
	printf '%s\n' '$(CHRONICLE_SIGNER_KEY_VALUE)' > "$(CHRONICLE_SIGNER_KEY)"
	printf '%s\n' '$(CHRONICLE_SIGNER_PUB_VALUE)' > "$(CHRONICLE_SIGNER_PUB)"
	printf '%s\n' '$(WITNESS_A_KEY_VALUE)' > "$(WITNESS_A_KEY)"
	printf '%s\n' '$(WITNESS_B_KEY_VALUE)' > "$(WITNESS_B_KEY)"
	{ \
		printf '%s\n' 'log $(CHRONICLE_SIGNER_PUB_VALUE)'; \
		printf '%s\n' 'witness witness-a $(WITNESS_A_PUB_VALUE) http://127.0.0.1$(WITNESS_A_ADDR)'; \
		printf '%s\n' 'witness witness-b $(WITNESS_B_PUB_VALUE) http://127.0.0.1$(WITNESS_B_ADDR)'; \
		printf '%s\n' 'group simulated-external-witnesses all witness-a witness-b'; \
		printf '%s\n' 'quorum simulated-external-witnesses'; \
	} > "$(WITNESS_POLICY)"

run: witness-demo-files
	@set -eu; \
	trap 'kill "$$witness_a" "$$witness_b" "$$server" 2>/dev/null || true; wait 2>/dev/null || true' INT TERM EXIT; \
	echo "starting witness A on $(WITNESS_A_ADDR)"; \
	$(MAKE) _run-witness-a & witness_a=$$!; \
	echo "starting witness B on $(WITNESS_B_ADDR)"; \
	$(MAKE) _run-witness-b & witness_b=$$!; \
	sleep 1; \
	echo "starting Chronicle on $(CHRONICLE_ADDR)"; \
	$(MAKE) _run-server & server=$$!; \
	wait "$$server"

run-server: witness-demo-files _run-server

_run-server:
	CHRONICLE_ADDR="$(CHRONICLE_ADDR)" \
	CHRONICLE_LOG_DIR="$(LOG_DIR)" \
	CHRONICLE_SIGNER_KEY_FILE="$(CHRONICLE_SIGNER_KEY)" \
	CHRONICLE_STORAGE_BACKEND=posix \
	CHRONICLE_WITNESS_POLICY_FILE="$(WITNESS_POLICY)" \
	CHRONICLE_WITNESS_FAIL_OPEN=false \
	CHRONICLE_WITNESS_TIMEOUT=5s \
	go run .

run-witness-a: witness-demo-files _run-witness-a

_run-witness-a:
	CHRONICLE_WITNESS_ADDR="$(WITNESS_A_ADDR)" \
	CHRONICLE_WITNESS_LOG_ORIGIN=chronicle \
	CHRONICLE_WITNESS_SIGNER_KEY_FILE="$(WITNESS_A_KEY)" \
	CHRONICLE_WITNESS_LOG_VERIFIER_KEY_FILE="$(CHRONICLE_SIGNER_PUB)" \
	CHRONICLE_WITNESS_STATE_DIR="$(WITNESS_A_STATE)" \
	go run ./cmd/witness

run-witness-b: witness-demo-files _run-witness-b

_run-witness-b:
	CHRONICLE_WITNESS_ADDR="$(WITNESS_B_ADDR)" \
	CHRONICLE_WITNESS_LOG_ORIGIN=chronicle \
	CHRONICLE_WITNESS_SIGNER_KEY_FILE="$(WITNESS_B_KEY)" \
	CHRONICLE_WITNESS_LOG_VERIFIER_KEY_FILE="$(CHRONICLE_SIGNER_PUB)" \
	CHRONICLE_WITNESS_STATE_DIR="$(WITNESS_B_STATE)" \
	go run ./cmd/witness

clean-demo:
	rm -rf "$(DEMO_DIR)" "$(LOG_DIR)"

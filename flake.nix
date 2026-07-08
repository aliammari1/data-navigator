{
  description = "Data Navigator — full dev environment (Electron + Next.js + DuckDB + node-llama-cpp + Python pipeline tooling)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  # Pulls prebuilt binaries for common dev tools from the community cache
  # instead of building everything from source. Speeds up first `nix develop`
  # significantly.
  nixConfig = {
    extra-substituters = [ "https://nix-community.cachix.org" ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        # `nix fmt` will format this flake.nix itself using alejandra
        formatter = pkgs.alejandra;

        devShells.default = pkgs.mkShell {
          name = "data-navigator";

          # Node/pnpm/typescript are deliberately NOT provided here. This
          # project's mise.toml pins the Node version and owns the JS/TS
          # runtime; declaring it again in this flake caused a real PATH
          # conflict (nix profile Node 22 vs mise-pinned Node 24). This
          # devShell is scoped to what mise can't provide: the native build
          # toolchain and generic CLI tools. Enter it explicitly with
          # `nix develop` only when you need to rebuild native addons;
          # day-to-day activation is direnv -> mise (see .envrc).
          packages = with pkgs; [
            # ---- Native module build toolchain ----
            # Required by node-gyp (better-sqlite3) and node-llama-cpp's
            # cmake-based llama.cpp backend build when no prebuilt binary matches.
            gcc
            gnumake
            cmake
            pkg-config
            python3                       # node-gyp shells out to python3

            # ---- Python pipeline tooling (LangChain/LangGraph side) ----
            uv
            ruff
            # `ty` isn't reliably packaged in nixpkgs yet — run it via
            # `uv run ty check` instead, so it stays pinned in pyproject.toml.

            # ---- Databases / data tools ----
            duckdb                        # CLI — handy for poking at .duckdb files directly
            sqlite                        # CLI — for inspecting better-sqlite3-backed state

            # ---- General CLI quality-of-life ----
            git
            gh                             # GitHub CLI, useful given your GH Actions workflows
            ripgrep
            fd
            jq
            tree
            htop

            # ---- Nix tooling, for editing this file itself ----
            nixd                            # Nix language server (VS Code "Nix IDE" extension picks this up)
            alejandra                       # Nix formatter
          ];
          # Task running is handled by mise (see mise.toml) rather than a
          # nix-provided `just` — mise is expected to already be installed
          # on your system. Add `pkgs.mise` to the list above if you'd
          # rather have Nix provide it too for reproducibility.

          shellHook = ''
            # Native addons compiled in this shell (better-sqlite3, node-llama-cpp)
            # link against libstdc++ at runtime — keep it resolvable, or you'll
            # hit "cannot open shared object file: libstdc++.so.6" at runtime.
            export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:$LD_LIBRARY_PATH"

            echo ""
            echo "  Data Navigator native-toolchain shell (gcc/cmake/python3 for node-gyp & node-llama-cpp)"
            echo "  node/pnpm come from mise, not this shell — run 'mise install' if missing"
            echo "  python  $(python3 --version)"
            echo "  uv      $(uv --version)"
            echo "  duckdb  $(duckdb --version 2>/dev/null || echo 'n/a')"
            echo ""
          '';
        };
      });
}

# ---------------------------------------------------------------------------
# Optional: pin Playwright's browser binaries via nixpkgs instead of letting
# Playwright's own postinstall download them. Only worth doing if downloads
# become flaky — on Arch (not NixOS) the FHS is intact, so the normal
# postinstall download already works fine without this.
#
# Only add this if nixpkgs' `playwright-driver` version matches your
# package.json's `playwright` version exactly — a mismatch causes
# driver/browser protocol errors.
#
#   packages = [ ... pkgs.playwright-driver.browsers ... ];
#   shellHook additions:
#     export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
#     export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# ---------------------------------------------------------------------------

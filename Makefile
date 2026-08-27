PREFIX ?= /usr/local
BINDIR ?= $(PREFIX)/bin
OMARCHY_PLUGIN_DIR ?= $(HOME)/.config/omarchy/plugins

build:
	cargo build --release

install:
	install -Dm755 target/release/meteobar $(DESTDIR)$(BINDIR)/meteobar

uninstall:
	rm -f $(DESTDIR)$(BINDIR)/meteobar

# Symlink the Omarchy shell (Quickshell) plugin into the user plugin dir.
# The shell does not watch files under a symlinked plugin dir; after editing,
# run `omarchy restart shell`. Requires the meteobar binary on
# PATH (make install, or the AUR package).
install-omarchy:
	@command -v meteobar >/dev/null 2>&1 || \
		echo "warning: meteobar not found on PATH — the widget will show an explicit error until it is installed (make install, or make install PREFIX=~/.local)"
	mkdir -p "$(OMARCHY_PLUGIN_DIR)"
	ln -sfT "$(abspath .)" "$(OMARCHY_PLUGIN_DIR)/mryll.meteobar"
	@echo "Linked $(OMARCHY_PLUGIN_DIR)/mryll.meteobar -> $(abspath .)"
	@echo 'Now add { "id": "mryll.meteobar" } to the bar layout in ~/.config/omarchy/shell.json'

uninstall-omarchy:
	rm -f "$(OMARCHY_PLUGIN_DIR)/mryll.meteobar"

# Unit-test the plugin's pure JS helpers. Needs node; the QML itself is
# checked by loading it (`omarchy restart shell`).
check-omarchy:
	node --test omarchy/*.test.mjs

.PHONY: build install uninstall install-omarchy uninstall-omarchy check-omarchy

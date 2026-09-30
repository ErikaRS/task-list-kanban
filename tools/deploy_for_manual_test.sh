#!/bin/bash
set -e

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
DEFAULT_TARGET_DIR="$PROJECT_ROOT/test-vault/obsidian-plugin-dev/.obsidian/plugins/task-list-kanban"

TARGET_DIR="$DEFAULT_TARGET_DIR"
RUN_LINT=false
TARGET_PROVIDED=false

for arg in "$@"; do
    case "$arg" in
        --lint)
            RUN_LINT=true
            ;;
        -*)
            echo "Unknown option: $arg" >&2
            echo "Usage: $0 [--lint] [target-directory]" >&2
            exit 1
            ;;
        *)
            if [ "$TARGET_PROVIDED" = true ]; then
                echo "Only one target directory may be specified" >&2
                echo "Usage: $0 [--lint] [target-directory]" >&2
                exit 1
            fi
            TARGET_DIR="$arg"
            TARGET_PROVIDED=true
            ;;
    esac
done

# Run quality checks before deploying
if [ "$RUN_LINT" = true ]; then
    echo "Running lint..."
    (cd "$PROJECT_ROOT" && npm run lint)

    echo "Running community lint..."
    (cd "$PROJECT_ROOT" && npm run communitylint)
fi

echo "Building plugin..."
(cd "$PROJECT_ROOT" && npm run build)

echo "Running tests..."
(cd "$PROJECT_ROOT" && npm test)

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Copy files
echo "Copying files to $TARGET_DIR..."
cp "$PROJECT_ROOT/main.js" "$TARGET_DIR/"
cp "$PROJECT_ROOT/manifest.json" "$TARGET_DIR/"
cp "$PROJECT_ROOT/styles.css" "$TARGET_DIR/"

echo "✓ Files copied successfully to $TARGET_DIR"

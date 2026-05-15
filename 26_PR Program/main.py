import sys
import os

# Get the absolute path to the 'src' directory
src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')

# Add the 'src' directory to the Python path
sys.path.insert(0, src_path)

from src.app import run

if __name__ == "__main__":
    run()
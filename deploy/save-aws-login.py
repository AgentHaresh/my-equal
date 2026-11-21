"""Save the AWS workshop login from the clipboard.

How to use:
  1. On the Workshop Studio page, click "Get AWS CLI credentials" and copy the block it shows.
  2. Run:  python deploy/save-aws-login.py

It reads the copied block, saves the three values to your AWS login file, and checks that they work.
It never prints the values.
"""
import configparser
import os
import re
import subprocess
import sys

NAMES = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]
REGION = "us-west-2"


def parse(text: str) -> dict:
    """Find the three values in any of the formats the page offers (bash, cmd, PowerShell)."""
    found = {}
    for name in NAMES:
        m = re.search(name + r"""\s*=\s*["']?([^"'\s]+)""", text)
        if m:
            found[name] = m.group(1)
    return found


def clipboard() -> str:
    out = subprocess.run(
        ["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"],
        capture_output=True, text=True,
    )
    return out.stdout or ""


def main() -> int:
    found = parse(clipboard())
    missing = [n for n in NAMES if n not in found]
    if missing:
        print("Could not find these in what you copied: " + ", ".join(missing))
        print('Go back to the Workshop Studio page, click "Get AWS CLI credentials",')
        print("copy the whole block (use its copy button), then run this again.")
        return 1

    folder = os.path.join(os.path.expanduser("~"), ".aws")
    os.makedirs(folder, exist_ok=True)

    creds = configparser.RawConfigParser()
    creds["default"] = {
        "aws_access_key_id": found["AWS_ACCESS_KEY_ID"],
        "aws_secret_access_key": found["AWS_SECRET_ACCESS_KEY"],
        "aws_session_token": found["AWS_SESSION_TOKEN"],
    }
    with open(os.path.join(folder, "credentials"), "w") as f:
        creds.write(f)

    config = configparser.RawConfigParser()
    config["default"] = {"region": REGION, "output": "json"}
    with open(os.path.join(folder, "config"), "w") as f:
        config.write(f)

    print(f"Saved. Region set to {REGION}. Checking the login...")
    check = subprocess.run(
        [sys.executable, "-m", "awscli", "sts", "get-caller-identity", "--query", "Account", "--output", "text"],
        capture_output=True, text=True,
    )
    if check.returncode == 0:
        print("It works. AWS account: " + check.stdout.strip())
        print('Now go back to Claude and say "done".')
        return 0
    print("The values were saved but AWS rejected them:")
    print((check.stderr or check.stdout).strip()[:300])
    print("Copy a fresh block from the page and run this again.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

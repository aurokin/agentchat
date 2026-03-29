from __future__ import annotations

import json
from pathlib import Path


def parse_env_file(path_str: str) -> dict[str, str]:
    path = Path(path_str)
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export ") :].strip()
        if not key:
            continue

        value = value.strip()
        if (
            len(value) >= 2
            and (
                (value.startswith('"') and value.endswith('"'))
                or (value.startswith("'") and value.endswith("'"))
            )
        ):
            value = value[1:-1]

        values[key] = value

    return values


def write_env_file(path_str: str, values: dict[str, str], heading: str) -> None:
    def render_value(value: str) -> str:
        safe = set(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_./:@%+=,-"
        )
        return value if value and all(char in safe for char in value) else json.dumps(value)

    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [heading, ""]
    for key in sorted(values):
        value = values[key]
        if value:
            lines.append(f"{key}={render_value(value)}")
    path.write_text("\n".join(lines) + "\n")

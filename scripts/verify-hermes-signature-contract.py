"""Offline contract probe against an explicitly supplied installed Hermes source.

Reads only synthetic request JSON from stdin. Extracts the real signature methods
without importing/starting the gateway. This is not an HTTP/end-to-end test.
"""
import ast
import hashlib
import hmac
import json
import logging
import sys
from pathlib import Path
from types import SimpleNamespace

source = Path(sys.argv[1]).read_text()
request_data = json.load(sys.stdin)
tree = ast.parse(source)
names = {"_validate_signature", "_hex_hmac", "_hmac_str_equal", "_timestamp_fresh"}
nodes = [node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name in names]
if {node.name for node in nodes} != names:
    raise RuntimeError("Installed signature contract changed; review the probe")
window = next(node.value.value for node in tree.body
              if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "_V2_REPLAY_WINDOW_SECONDS" for t in node.targets)
              and isinstance(node.value, ast.Constant))
module = ast.Module(body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), *nodes], type_ignores=[])
logger = logging.getLogger("hermes-offline-contract")
logger.addHandler(logging.NullHandler())
logger.propagate = False
namespace = {"hmac": hmac, "hashlib": hashlib, "logger": logger,
             "time": SimpleNamespace(time=lambda: request_data["now"]), "_V2_REPLAY_WINDOW_SECONDS": window}
exec(compile(ast.fix_missing_locations(module), "installed-hermes-signature-methods", "exec"), namespace)
headers = request_data["headers"]
body = request_data["body"].encode()
secret = request_data["secret"]
receiver = SimpleNamespace(_v1_signature_warned=set())


def validate(selected, raw_body=body):
    request = SimpleNamespace(headers=selected, match_info={"route_name": "synthetic-shadow"})
    return namespace["_validate_signature"](receiver, request, raw_body, secret)


def signed_time(timestamp):
    selected = dict(headers)
    selected["X-Webhook-Timestamp"] = timestamp
    selected["X-Webhook-Signature-V2"] = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return selected


bad = dict(headers, **{"X-Webhook-Signature-V2": "0" * 64})
missing = {key: value for key, value in headers.items() if key != "X-Webhook-Timestamp"}
result = {
    "valid": validate(headers),
    "tampered_signature": validate(bad),
    "tampered_body": validate(headers, body + b" "),
    "missing_timestamp": validate(missing),
    "stale_timestamp": validate(signed_time(str(request_data["now"] - window - 1))),
    "future_timestamp": validate(signed_time(str(request_data["now"] + window + 1))),
    "invalid_timestamp": validate(signed_time("not-a-timestamp")),
}
print(json.dumps(result))
if result != {key: key == "valid" for key in result}:
    raise SystemExit("Hermes signature contract probe failed")

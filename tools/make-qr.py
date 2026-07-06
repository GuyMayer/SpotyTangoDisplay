#!/usr/bin/env python3
"""
make-qr.py — Generate venue kit QR codes for SpotyTangoDisplay.

Produces two PNGs:
  tango-wifi-qr.png     WiFi auto-connect QR (join TangoDisplay network)
  tango-display-qr.png  Direct URL QR (opens display screen)

Usage:
    python3 tools/make-qr.py [--out DIR] [--host IP:PORT]

Requirements:
    pip install qrcode[pil]   (Pillow must also be available)
"""

import argparse
import os
import sys


def check_deps():
    try:
        import qrcode  # noqa: F401
    except ImportError:
        sys.exit("ERROR: qrcode not installed. Run: pip install qrcode[pil]")
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        sys.exit(
            "ERROR: Pillow not installed. Run: pip install Pillow\n"
            "       (Required by qrcode for PNG output)"
        )


def make_qr(data, path, desc):
    import qrcode

    qr = qrcode.QRCode(
        version=None,           # auto-size
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(path)
    size = os.path.getsize(path)
    print(f"  {desc}")
    print(f"    Data : {data}")
    print(f"    File : {path}  ({size:,} bytes)")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="Generate venue kit QR codes for SpotyTangoDisplay"
    )
    parser.add_argument(
        "--out",
        default=".",
        metavar="DIR",
        help="Output directory (default: current directory)",
    )
    parser.add_argument(
        "--host",
        default="192.168.8.100:3456",
        metavar="IP:PORT",
        help="DJ laptop address on the venue network (default: 192.168.8.100:3456)",
    )
    parser.add_argument(
        "--ssid",
        default="TangoDisplay",
        metavar="SSID",
        help="WiFi network name (default: TangoDisplay)",
    )
    args = parser.parse_args()

    check_deps()

    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    print(f"\nGenerating QR codes → {out}\n")

    # 1. WiFi auto-connect QR
    wifi_data = f"WIFI:T:nopass;S:{args.ssid};;"
    make_qr(
        data=wifi_data,
        path=os.path.join(out, "tango-wifi-qr.png"),
        desc="WiFi QR — participants scan to join the TangoDisplay network",
    )

    # 2. Direct display URL QR
    display_url = f"http://{args.host}/display.html"
    make_qr(
        data=display_url,
        path=os.path.join(out, "tango-display-qr.png"),
        desc="Display URL QR — scan to open the dancer display directly",
    )

    print("Done. Print both QRs:")
    print("  1. tango-wifi-qr.png  — Post near entrance: 'Join TangoDisplay WiFi'")
    print("  2. tango-display-qr.png — Fallback if captive portal doesn't pop up")


if __name__ == "__main__":
    main()

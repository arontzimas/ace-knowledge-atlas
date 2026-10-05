#!/usr/bin/env python3
"""Validate a crawled page JSON file. Usage: python3 validate_page.py <file.json> [...]"""
import json, sys
TYPES = {"faq","definition","assertion","comparison","steps","stat"}
PERSONAS = {"Medicare shopper","Individual & family shopper","Employer / HR leader","Broker / consultant","Current member","Medicaid household","Caregiver"}
INTENTS = {"Learn","Compare","Estimate cost","Check eligibility","Enroll","Use benefits","Get support","Stay compliant"}
STAGES = {"Awareness","Consideration","Decision","Member"}
ok = True
for f in sys.argv[1:]:
    errs = []
    try:
        d = json.load(open(f))
    except Exception as e:
        print(f"FAIL {f}: invalid JSON: {e}"); ok = False; continue
    for k in ["url","title","domain","page_type","summary","assets","atoms"]:
        if k not in d: errs.append(f"missing page key {k}")
    atoms = d.get("atoms", [])
    if not (4 <= len(atoms) <= 16): errs.append(f"atom count {len(atoms)} outside 4-16")
    for i,a in enumerate(atoms):
        for k in ["type","title","text","topic","tags","entities","personas","intent","stage","questions"]:
            if k not in a: errs.append(f"atom {i} missing {k}")
        if a.get("type") not in TYPES: errs.append(f"atom {i} bad type {a.get('type')}")
        if a.get("intent") not in INTENTS: errs.append(f"atom {i} bad intent {a.get('intent')}")
        if a.get("stage") not in STAGES: errs.append(f"atom {i} bad stage {a.get('stage')}")
        for p in a.get("personas", []):
            if p not in PERSONAS: errs.append(f"atom {i} bad persona {p}")
        w = len(str(a.get("text","")).split())
        if w < 15 or w > 170: errs.append(f"atom {i} text length {w} words")
    for s in d.get("assets", []):
        if s.get("kind") not in {"image","video","pdf"}: errs.append(f"bad asset kind {s.get('kind')}")
        if not str(s.get("src","")).startswith("http"): errs.append(f"asset src not absolute: {s.get('src')}")
    if errs:
        ok = False; print(f"FAIL {f}:"); [print("  -", e) for e in errs[:12]]
    else:
        print(f"OK   {f} ({len(atoms)} atoms, {len(d.get('assets',[]))} assets)")
sys.exit(0 if ok else 1)

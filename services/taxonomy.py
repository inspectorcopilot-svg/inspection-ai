ALLOWED_SYSTEMS = {
    "Electrical",
    "Plumbing",
    "HVAC",
    "Structural",
    "Roofing",
    "Exterior",
    "General",
}

ALLOWED_COMPONENTS = {
    "Electrical Outlet",
    "GFCI Outlet",
    "Circuit Breakers",
    "Electrical Panel",
    "Subpanel",
    "Electrical Wiring",
    "Ceiling",
    "Wall",
    "Foundation Wall",
    "Furnace Filter",
    "Pipe",
    "Drain Line",
    "Roof Surface",
    "Shingles",
    "General",
}


def validate_system(system: str) -> str:
    return system if system in ALLOWED_SYSTEMS else "General"


def validate_component(component: str) -> str:
    return component if component in ALLOWED_COMPONENTS else component or "General"
# Open-Source GIS Leaflet Map Integration & Geographic Projection Guide

This document specifies the **Open-Source Leaflet GIS Map Engine** integrated into the **Sea Power Admiral AI Dashboard**, projecting in-game local coordinates into real-world geographic coordinates ($\text{Lat}/\text{Lng}$).

---

## 🗺️ Geographic Projection Mathematics

In *Sea Power*, game coordinates specify Easting ($X$) and Northing ($Z$) in **Nautical Miles (NM)** relative to the scenario reference origin:

$$\text{Reference Origin: } \phi_0 = 62.0^\circ\text{ N (GIUK Gap / Norwegian Sea)}, \quad \lambda_0 = -15.0^\circ\text{ W}$$

### Projection Formulas:

$$\Delta \text{Latitude (deg)} = \frac{\text{posZ (NM)}}{60.0}$$

$$\Delta \text{Longitude (deg)} = \frac{\text{posX (NM)}}{60.0 \times \cos(\phi_0 \times \pi / 180)}$$

$$\text{Latitude} = \phi_0 + \Delta \text{lat}$$
$$\text{Longitude} = \lambda_0 + \Delta \text{lng}$$

---

## 🌍 Supported Open-Source GIS Map Layers

Users can toggle between three high-definition map tile providers using the Leaflet layer control in the upper right:

1. **🌙 CartoDB Dark Matter:** High-contrast tactical dark theme optimized for military C2 dashboards.
2. **🛰️ Esri World Imagery:** High-resolution satellite imagery showing real ocean bathymetry and coastlines.
3. **🗺️ OpenStreetMap Standard:** Open-source geographic vector map.

---

## ⚓ Features & Interactive Popups

* **Rotated Vessel Markers:** Markers reflect true vessel heading ($0^\circ-360^\circ$).
* **Embarked Storage Badges:** Co-located or embarked aircraft display badges: `USS Nimitz [+24 units in storage]`.
* **Interactive Dark Popups:** Clicking any vessel or aircraft opens a rich popup displaying speed (kts), heading ($^\circ$), altitude (m), geographic coordinates, and an embarked air group breakdown.
* **Vector Mode Toggle:** Users can instantly toggle between **`🗺️ GIS Map`** and **`📡 Radar Grid`** with one click.

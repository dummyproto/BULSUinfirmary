// Real Philippine Standard Geographic Code (PSGC) data — 17 regions, 88
// provinces, 1,627 cities/municipalities, 41,582 barangays — from the
// phil-reg-prov-mun-brgy npm package, rather than a hand-maintained
// partial list, which would inevitably be incomplete or go stale.
//
// The package's own data is CODE-based (regions have a code, provinces
// reference their region's code, etc.) — but every address field this
// app already saves (patient_profiles.addr_region/addr_province/
// addr_city/addr_barangay) has always stored a plain readable NAME,
// since these used to be free-text inputs. This wrapper resolves codes
// internally so the rest of the app never has to deal with them: give
// it a parent's NAME, get the child options' NAMEs back. That also
// means an address someone already saved before this change still
// works exactly the same way — nothing to migrate.
//
// The full dataset is ~1.8MB (mostly barangays.json) — lazy-loaded only
// when something actually calls one of these functions (i.e. only when
// the Address section of the profile edit form is actually used), the
// same reasoning already applied to heic2any in ScanTab.jsx, rather
// than adding that weight to every page's initial load.

let dataPromise = null
function loadData() {
  if (!dataPromise) dataPromise = import('phil-reg-prov-mun-brgy')
  return dataPromise
}

function sortByName(arr) {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name))
}

export async function getRegions() {
  const { regions } = await loadData()
  return sortByName(regions).map((r) => r.name)
}

export async function getProvinces(regionName) {
  if (!regionName) return []
  const { regions, getProvincesByRegion } = await loadData()
  const region = regions.find((r) => r.name === regionName)
  if (!region) return []
  return sortByName(getProvincesByRegion(region.reg_code)).map((p) => p.name)
}

// Needs regionName too, not just provinceName — province names are
// unlikely but not guaranteed unique nationwide, and scoping the lookup
// to "the province named X within region Y" (matching how the dropdown
// itself only ever offers provinces belonging to the already-selected
// region) avoids ever resolving to the wrong one.
export async function getCities(provinceName, regionName) {
  if (!provinceName || !regionName) return []
  const { regions, provinces, getCityMunByProvince } = await loadData()
  const region = regions.find((r) => r.name === regionName)
  if (!region) return []
  const province = provinces.find((p) => p.name === provinceName && p.reg_code === region.reg_code)
  if (!province) return []
  return sortByName(getCityMunByProvince(province.prov_code)).map((c) => c.name)
}

// Needs provinceName too — city/municipality names are genuinely NOT
// unique nationwide (many towns share names like "San Fernando" or "San
// Jose" across different provinces), so a name-only lookup here could
// silently resolve to a same-named city in a completely different
// province and show the wrong barangay list. Scoping to "the city named
// X within province Y" avoids that.
export async function getBarangays(cityName, provinceName) {
  if (!cityName || !provinceName) return []
  const { provinces, city_mun, getBarangayByMun } = await loadData()
  const province = provinces.find((p) => p.name === provinceName)
  if (!province) return []
  const city = city_mun.find((c) => c.name === cityName && c.prov_code === province.prov_code)
  if (!city) return []
  return sortByName(getBarangayByMun(city.mun_code)).map((b) => b.name)
}
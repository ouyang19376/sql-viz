import * as echarts from 'echarts'
import chinaGeo from '@/data/china-provinces.json'
import { BASE_URL } from '@/api/bi'

// 省级全称后缀，长在前以避免「自治区」误截「壮族自治区」。
const NAME_SUFFIXES = [
  '壮族自治区',
  '维吾尔自治区',
  '回族自治区',
  '特别行政区',
  '自治区',
  '省',
  '市',
]

// 城市后缀，长在前避免「自治州」误截「族自治州」等。覆盖市/区/县/自治州/盟/地区。
const CITY_SUFFIXES = [
  '土家族苗族自治州',
  '布依族苗族自治州',
  '苗族侗族自治州',
  '苗族自治州',
  '藏族自治州',
  '彝族自治州',
  '傣族自治州',
  '回族自治州',
  '哈萨克自治州',
  '蒙古族藏族自治州',
  '各族自治县',
  '瑶族自治县',
  '自治县',
  '自治州',
  '地区',
  '盟',
  '市辖区',
  '新区',
  '县级市',
  '县',
  '市',
  '区',
]

let registered = false

/** 把省份全称归一化为常用简称：
 *  北京市→北京、广东省→广东、广西壮族自治区→广西、新疆维吾尔自治区→新疆、内蒙古自治区→内蒙古。 */
export function normalizeKey(v: string): string {
  let s = String(v ?? '').trim()
  for (const suf of NAME_SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      s = s.slice(0, -suf.length)
      break
    }
  }
  return s
}

/** 把城市全称归一化为常用简称：广州市→广州、湘西土家族苗族自治州→湘西、龙岗区→龙岗。
 *  用于城市级地图区域名匹配（注册时与数据行同用此函数归一化）。 */
export function normalizeCity(v: string): string {
  let s = String(v ?? '').trim()
  for (const suf of CITY_SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      s = s.slice(0, -suf.length)
      break
    }
  }
  return s
}

type GeoFeature = { properties?: { name?: string; adcode?: string | number } }
type GeoJSONLike = { features?: GeoFeature[] }

/** 幂等注册中国省级地图：先把 GeoJSON 的 region name 归一化为简称再注册，
 *  使地图区域名与常用地区列值（「北京」「广东」）匹配。仅在选 map 类型时调用。 */
export function ensureChinaMap(): void {
  if (registered) return
  const src = chinaGeo as unknown as GeoJSONLike
  const geo = {
    ...src,
    features: (src.features ?? []).map((f) => ({
      ...f,
      properties: { ...f.properties, name: normalizeKey(f.properties?.name ?? '') },
    })),
  }
  echarts.registerMap('china', geo as Parameters<typeof echarts.registerMap>[1])
  registered = true
}

// 省名(归一化)→adcode，懒初始化自全国 GeoJSON 的 feature.properties.adcode。
const provinceAdcode = new Map<string, string>()

function ensureAdcodeMap(): void {
  if (provinceAdcode.size) return
  const src = chinaGeo as unknown as GeoJSONLike
  for (const f of src.features ?? []) {
    const name = normalizeKey(f.properties?.name ?? '')
    const adcode = f.properties?.adcode
    if (name && adcode != null) provinceAdcode.set(name, String(adcode))
  }
}

const loadedCities = new Set<string>()
const inflight = new Map<string, Promise<string>>()

/** 异步懒加载某省城市地图：
 *  经后端代理拉取 adcode 对应边界（前端直连 DataV 被 403，见后端 bi_geo）
 *  → 归一化城市名 → 注册 china:{provinceKey}。
 *  内存缓存（二次秒开）+ in-flight 去重（快速下钻不重复请求）。
 *  失败抛错，由 ChartCard 捕获显示「城市地图加载失败」。 */
export function ensureCityMap(provinceKey: string): Promise<string> {
  const mapName = `china:${provinceKey}`
  if (loadedCities.has(mapName)) return Promise.resolve(mapName)
  const existing = inflight.get(mapName)
  if (existing) return existing

  ensureAdcodeMap()
  const adcode = provinceAdcode.get(provinceKey)
  const p = (async () => {
    if (!adcode) throw new Error(`未知省份：${provinceKey}`)
    const resp = await fetch(`${BASE_URL}/bi/geo/city/${adcode}`)
    if (!resp.ok) throw new Error(`城市地图下载失败：${adcode}`)
    const geo = (await resp.json()) as GeoJSONLike
    geo.features = (geo.features ?? []).map((f) => ({
      ...f,
      properties: { ...f.properties, name: normalizeCity(f.properties?.name ?? '') },
    }))
    echarts.registerMap(mapName, geo as unknown as Parameters<typeof echarts.registerMap>[1])
    loadedCities.add(mapName)
    return mapName
  })()
  inflight.set(mapName, p)
  p.finally(() => inflight.delete(mapName))
  return p
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FavoriteEntry {
  functionId: string
  dialectId: string
  addedAt: number
}

interface FavoriteStore {
  favorites: FavoriteEntry[]
  isFavorite: (functionId: string, dialectId: string) => boolean
  toggle: (functionId: string, dialectId: string) => void
}

/** 收藏列表（F-FC-04）：localStorage 持久化，key 同 tech-plan §5.1 */
export const useFavoriteStore = create<FavoriteStore>()(
  persist(
    (set, get) => ({
      favorites: [],

      isFavorite: (functionId, dialectId) =>
        get().favorites.some(
          (f) => f.functionId === functionId && f.dialectId === dialectId,
        ),

      toggle: (functionId, dialectId) => {
        const { favorites, isFavorite } = get()
        if (isFavorite(functionId, dialectId)) {
          set({
            favorites: favorites.filter(
              (f) =>
                !(f.functionId === functionId && f.dialectId === dialectId),
            ),
          })
        } else {
          set({
            favorites: [
              ...favorites,
              { functionId, dialectId, addedAt: Date.now() },
            ],
          })
        }
      },
    }),
    { name: 'sqlviz_favorites' },
  ),
)

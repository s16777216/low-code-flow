import type { InjectionKey, Ref } from 'vue'
import type { TypeCatalog } from './catalog'

/** The Types of the open Project, provided once by the editor and read by canvas components. */
export const catalogKey: InjectionKey<Ref<TypeCatalog>> = Symbol('typeCatalog')

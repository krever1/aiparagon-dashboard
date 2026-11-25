'use client'

import { createContext, useContext } from 'react'
import type { TypeNames } from '@/lib/catalyst/calls'

// The team's names for the built-in call types and the type buttons (ai_settings call_type_names, v144Labels), for every
// picker and label under Calls and Tasks.

const NamesCtx = createContext<TypeNames>({})

export const TypeNamesProvider = NamesCtx.Provider
export const useTypeNames = () => useContext(NamesCtx)

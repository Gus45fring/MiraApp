if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/home/gus/.gradle/caches/9.3.1/transforms/bbd5a7ad7bdfcafed9751176be81f27f/transformed/hermes-android-250829098.0.16-debug/prefab/modules/hermesvm/libs/android.arm64-v8a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/gus/.gradle/caches/9.3.1/transforms/bbd5a7ad7bdfcafed9751176be81f27f/transformed/hermes-android-250829098.0.16-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


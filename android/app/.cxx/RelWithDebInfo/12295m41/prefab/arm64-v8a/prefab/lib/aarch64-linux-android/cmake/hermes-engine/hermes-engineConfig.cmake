if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/home/gus/.gradle/caches/9.3.1/transforms/55b604d7adc223b102b75b3587e33a49/transformed/hermes-android-250829098.0.16-release/prefab/modules/hermesvm/libs/android.arm64-v8a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/gus/.gradle/caches/9.3.1/transforms/55b604d7adc223b102b75b3587e33a49/transformed/hermes-android-250829098.0.16-release/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


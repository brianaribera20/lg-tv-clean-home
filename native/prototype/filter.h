#include <stdint.h>
/* Home presses within 2 s that stop the helper (5 since 28 Oct 2026; 3 was hit by accident). */
#define HOME_TAPS 5
struct ev {uint32_t sec,usec;uint16_t type,code;int32_t value;};
struct filter {int home,short_press,count,disabled,back,back_fired;uint64_t back_since;uint64_t since,last,taps[HOME_TAPS];};
enum action {PASS,OPEN_HOME,DROP,RELEASE,OPEN_LG};
int filter_event(struct filter*,const struct ev*,uint64_t);
int filter_timeout(struct filter*,uint64_t);

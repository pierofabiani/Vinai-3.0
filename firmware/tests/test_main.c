#include "test.h"

int t_fail = 0, t_pass = 0;

void run_core_tests(void);
void run_app_tests(void);

int main(void)
{
    printf("== Test moduli core ==\n");
    run_core_tests();
    printf("== Test driver e applicazione ==\n");
    run_app_tests();
    printf("\n%d controlli superati, %d falliti\n", t_pass, t_fail);
    return t_fail ? 1 : 0;
}
